'use client';

import { useListSearch, usePaginatedList } from '@/lib/api/use-paginated-list';
import { Pagination } from '@/components/ui/pagination';
import { ListSearch } from '@/components/ui/list-search';
import type { InspectionDTO } from '@/features/quality/api';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface NcrDto {
  id: string;
  ncrNumber: string;
  title: string;
  description?: string;
  severity: "CRITICAL" | "MAJOR" | "MINOR";
  status: "OPEN" | "RESOLVED" | "CLOSED";
  rootCause?: string;
  containmentAction?: string;
  correctiveAction?: string;
  createdAt: string;
}

import Link from 'next/link';

import { ButtonLink } from '@/components/ui/button-link';
import { Badge } from '@/components/ui/badge';
import { formatQuantity } from '@/domain/quantity';
import { PageHeader } from '@/components/ui/page-header';
import { Panel } from '@/components/ui/panel';
import { EmptyState } from '@/components/ui/empty-state';

export function InspectionListView() {
  const [activeMainTab, setActiveMainTab] = useState<"inspections" | "ncrs">("inspections");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const queryClient = useQueryClient();

  // NCR query & mutations
  const ncrsQuery = useQuery({
    queryKey: ["quality", "ncrs"],
    queryFn: async () => {
      const res = await apiRequest<{ data: NcrDto[] }>("/api/quality/ncrs");
      return res.data;
    },
    enabled: activeMainTab === "ncrs",
  });

  const [showNcrModal, setShowNcrModal] = useState(false);
  const [ncrTitle, setNcrTitle] = useState("");
  const [ncrSeverity, setNcrSeverity] = useState<"CRITICAL" | "MAJOR" | "MINOR">("MAJOR");
  const [ncrDescription, setNcrDescription] = useState("");

  const createNcrMutation = useMutation({
    mutationFn: async (input: { title: string; severity: string; description?: string }) => {
      return apiRequest("/api/quality/ncrs", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quality", "ncrs"] });
      setShowNcrModal(false);
      setNcrTitle("");
      setNcrDescription("");
    },
  });

  const [showResolveNcrModal, setShowResolveNcrModal] = useState(false);
  const [resolvingNcrId, setResolvingNcrId] = useState<string | null>(null);
  const [rootCause, setRootCause] = useState("");
  const [containmentAction, setContainmentAction] = useState("");
  const [correctiveAction, setCorrectiveAction] = useState("");

  const resolveNcrMutation = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: { rootCause: string; containmentAction: string; correctiveAction: string } }) => {
      return apiRequest("/api/quality/ncrs/" + id + "/resolve", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quality", "ncrs"] });
      setShowResolveNcrModal(false);
      setResolvingNcrId(null);
      setRootCause("");
      setContainmentAction("");
      setCorrectiveAction("");
    },
  });

  const closeNcrMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("/api/quality/ncrs/" + id + "/close", {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quality", "ncrs"] });
    },
  });

  const { search, setSearch, query } = useListSearch();
  const { data: pageData, isLoading, error, pagination } = usePaginatedList<InspectionDTO>('inspections', { status: statusFilter, search: query || undefined });
  const inspections = pageData?.data || [];

  return (
    <div className="page-stack">
      <PageHeader
        title="Quality Control & Inspections"
        description="Verify manufactured outputs and receipts against engineering specifications, checklists, and Non-Conformance Reports (NCR)."
        actions={
          activeMainTab === "ncrs" ? (
            <Button variant="primary" onClick={() => setShowNcrModal(true)} icon="plus">
              Create NCR
            </Button>
          ) : undefined
        }
      />

            {/* Top Level Category Tabs */}
      <div className="flex border-b border-line gap-6 text-xs font-semibold mb-4">
        <button
          type="button"
          onClick={() => setActiveMainTab("inspections")}
          className={"pb-3 pt-1 border-b-2 transition-colors " + (activeMainTab === "inspections" ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink")}
        >
          Quality Inspections ({inspections.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveMainTab("ncrs")}
          className={"pb-3 pt-1 border-b-2 transition-colors " + (activeMainTab === "ncrs" ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink")}
        >
          Non-Conformance Reports (NCR)
        </button>
      </div>

      {activeMainTab === "inspections" && (
        <>
      {/* Filter Tabs */}
      <div className="tabs">
        <button
          type="button"
          onClick={() => setStatusFilter('')}
          className={`tab ${statusFilter === '' ? 'active' : ''}`}
        >
          All Inspections
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('DRAFT')}
          className={`tab ${statusFilter === 'DRAFT' ? 'active' : ''}`}
        >
          Pending / Draft
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('FINALIZED')}
          className={`tab ${statusFilter === 'FINALIZED' ? 'active' : ''}`}
        >
          Finalized & Released
        </button>
      </div>

      <ListSearch value={search} onChange={setSearch} placeholder="Search item, order, lot or inspection…" label="Search inspections" />

      <Panel>
        {isLoading ? (
          <div className="p-8 text-center text-xs text-muted">
            Loading inspections ledger...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-xs text-danger">
            Failed to load inspections: {error.message}
          </div>
        ) : !inspections || inspections.length === 0 ? (
          <EmptyState
            title="No inspections found"
            description="Inspections are created when shop floor operators submit production outputs or warehouse staff receive materials."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-line text-muted font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Inspection</th>
                  <th className="py-3 px-4">Source & Item</th>
                  <th className="py-3 px-4">Lot / Batch</th>
                  <th className="py-3 px-4">Inspected</th>
                  <th className="py-3 px-4">Passed</th>
                  <th className="py-3 px-4">Rework</th>
                  <th className="py-3 px-4">Scrap</th>
                  <th className="py-3 px-4">Disposition</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-ink">
                {inspections.map((insp) => (
                  <tr key={insp.id} className="hover:bg-surface-muted/50 transition">
                    <td className="py-3 px-4 font-mono font-medium">
                      <Link
                        href={`/quality/inspections/${insp.id}`}
                        className="text-primary hover:underline"
                      >
                        {insp.id.slice(0, 8)}…
                      </Link>
                      <div className="text-xs text-muted font-sans mt-0.5">
                        {new Date(insp.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium">
                        {insp.productionOutput?.item?.name || 'Production Batch'}
                      </div>
                      <div className="text-xs text-muted">
                        {insp.productionOutput?.task?.instance?.order?.orderNumber
                          ? `Order ${insp.productionOutput.task.instance.order.orderNumber}`
                          : insp.sourceType}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs">
                      {insp.productionOutput?.lot?.lotNumber || '—'}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold">
                      {formatQuantity(insp.inspectedAtoms)}
                    </td>
                    <td className="py-3 px-4 font-mono text-success">
                      {formatQuantity(insp.passedAtoms)}
                    </td>
                    <td className="py-3 px-4 font-mono text-warning">
                      {formatQuantity(insp.reworkAtoms)}
                    </td>
                    <td className="py-3 px-4 font-mono text-danger">
                      {formatQuantity(insp.scrappedAtoms)}
                    </td>
                    <td className="py-3 px-4">
                      {insp.status === 'DRAFT' ? (
                        <Badge variant="warning">DRAFT / PENDING</Badge>
                      ) : insp.disposition === 'PASSED' ? (
                        <Badge variant="success">PASSED</Badge>
                      ) : insp.disposition === 'REWORK' ? (
                        <Badge variant="warning">REWORK HELD</Badge>
                      ) : insp.disposition === 'SCRAPPED' ? (
                        <Badge variant="danger">SCRAPPED</Badge>
                      ) : (
                        <Badge variant="blue">PARTIAL</Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <ButtonLink
                        href={`/quality/inspections/${insp.id}`}
                        size="small"
                      >
                        {insp.status === 'DRAFT' ? 'Conduct QC' : 'View Disposition'}
                      </ButtonLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Pagination {...pagination} />
        </>
      )}

      {activeMainTab === "ncrs" && (
        <div className="space-y-4">
          {ncrsQuery.isLoading ? (
            <div className="p-8 text-center text-xs text-muted">
              Loading Non-Conformance Reports...
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white border-line">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b bg-surface text-muted font-semibold uppercase tracking-wider border-line">
                    <th className="py-3 px-4">NCR Number</th>
                    <th className="py-3 px-4">Defect Description & Notes</th>
                    <th className="py-3 px-4">Severity</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Containment & CAPA</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-ink">
                  {(!ncrsQuery.data || ncrsQuery.data.length === 0) ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted">
                        No Non-Conformance Reports logged.
                      </td>
                    </tr>
                  ) : (
                    ncrsQuery.data.map((ncr) => (
                      <tr key={ncr.id} className="hover:bg-surface-muted transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-ink">
                          {ncr.ncrNumber}
                        </td>
                        <td className="py-3 px-4">
                          <strong className="text-ink">{ncr.title}</strong>
                          {ncr.description && (
                            <p className="text-muted mt-0.5">{ncr.description}</p>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant={ncr.severity === "CRITICAL" ? "danger" : ncr.severity === "MAJOR" ? "warning" : "default"}>
                            {ncr.severity}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant={ncr.status === "CLOSED" ? "success" : ncr.status === "RESOLVED" ? "blue" : "warning"}>
                            {ncr.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-xs text-muted">
                          {ncr.containmentAction ? (
                            <div>
                              <span className="font-semibold text-ink">Containment:</span> {ncr.containmentAction}
                            </div>
                          ) : (
                            <span className="text-warning">Pending containment</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {ncr.status === "OPEN" && (
                              <Button
                                size="small"
                                variant="primary"
                                onClick={() => {
                                  setResolvingNcrId(ncr.id);
                                  setShowResolveNcrModal(true);
                                }}
                              >
                                Resolve & CAPA
                              </Button>
                            )}
                            {ncr.status === "RESOLVED" && (
                              <Button
                                size="small"
                                onClick={() => closeNcrMutation.mutate(ncr.id)}
                                disabled={closeNcrMutation.isPending}
                              >
                                Close NCR
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create NCR Modal */}
      {showNcrModal && (
        <Dialog
          isOpen
          onClose={() => setShowNcrModal(false)}
          title="Create Non-Conformance Report (NCR)"
          size="md"
          pending={createNcrMutation.isPending}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createNcrMutation.mutate({
                title: ncrTitle.trim(),
                severity: ncrSeverity,
                description: ncrDescription.trim() || undefined,
              });
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                NCR Title & Deviation Summary
              </label>
              <Input
                type="text"
                required
                value={ncrTitle}
                onChange={(e) => setNcrTitle(e.target.value)}
                placeholder="e.g. Surface roughness exceeding Ra 0.8 specification"
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Defect Severity Classification
              </label>
              <Select
                value={ncrSeverity}
                onChange={(e: any) => setNcrSeverity(e.target.value)}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              >
                <option value="CRITICAL">Critical (Immediate containment / safety hazard)</option>
                <option value="MAJOR">Major (Dimensional or functional out of tolerance)</option>
                <option value="MINOR">Minor (Cosmetic or minor documentation defect)</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Detailed Non-Conformance Notes
              </label>
              <Textarea
                value={ncrDescription}
                onChange={(e) => setNcrDescription(e.target.value)}
                placeholder="Observed defect, sample measurements, affected lot or workstation..."
                rows={3}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              />
            </div>

            <div className="dialog-actions">
              <Button onClick={() => setShowNcrModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={createNcrMutation.isPending}>
                {createNcrMutation.isPending ? "Submitting..." : "Submit NCR"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Resolve NCR Modal */}
      {showResolveNcrModal && resolvingNcrId && (
        <Dialog
          isOpen
          onClose={() => { setShowResolveNcrModal(false); setResolvingNcrId(null); }}
          title="Resolve NCR: Root Cause & CAPA"
          size="md"
          pending={resolveNcrMutation.isPending}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              resolveNcrMutation.mutate({
                id: resolvingNcrId,
                input: {
                  rootCause: rootCause.trim(),
                  containmentAction: containmentAction.trim(),
                  correctiveAction: correctiveAction.trim(),
                },
              });
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Root Cause Investigation
              </label>
              <Textarea
                required
                value={rootCause}
                onChange={(e) => setRootCause(e.target.value)}
                placeholder="Underlying cause (e.g. worn insert, incorrect feed rate, coolant degradation)..."
                rows={2}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Immediate Containment Action
              </label>
              <Textarea
                required
                value={containmentAction}
                onChange={(e) => setContainmentAction(e.target.value)}
                placeholder="Actions taken to isolate suspect inventory (e.g. quarantined 40 units in location Q-01)..."
                rows={2}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Corrective & Preventive Action (CAPA)
              </label>
              <Textarea
                required
                value={correctiveAction}
                onChange={(e) => setCorrectiveAction(e.target.value)}
                placeholder="Long-term prevention (e.g. recalibrated tool offset limit, updated SOP inspection frequency)..."
                rows={2}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              />
            </div>

            <div className="dialog-actions">
              <Button onClick={() => { setShowResolveNcrModal(false); setResolvingNcrId(null); }}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={resolveNcrMutation.isPending || !rootCause || !containmentAction || !correctiveAction}
              >
                {resolveNcrMutation.isPending ? "Resolving..." : "Confirm Resolution"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
