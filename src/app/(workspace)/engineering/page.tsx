"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListSearch, usePaginatedList } from "@/lib/api/use-paginated-list";
import { Pagination } from "@/components/ui/pagination";
import { ListSearch } from "@/components/ui/list-search";
import type { OrderDto } from "@/features/orders/api";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LoadingState, ErrorState } from "@/components/ui/resource-state";
import { apiRequest } from "@/lib/api/client";
import { formatQuantity } from "@/domain/quantity";

interface EcoDto {
  id: string;
  ecoNumber: string;
  title: string;
  description?: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "APPLIED";
  reasonCategory: string;
  targetType: string;
  effectiveDate?: string;
  createdAt: string;
}

interface SubstituteDto {
  id: string;
  originalItemId: string;
  originalItemCode: string;
  originalItemName: string;
  substituteItemId: string;
  substituteItemCode: string;
  substituteItemName: string;
  conversionRatioAtoms: string;
  isActive: boolean;
  notes?: string;
}

export default function EngineeringHubPage() {
  const [activeTab, setActiveTab] = useState<"orders" | "ecos" | "substitutes">("orders");
  const queryClient = useQueryClient();

  // Orders Tab
  const { search, setSearch, query } = useListSearch();
  const { data: pageData, isPending, error, refetch, pagination } = usePaginatedList<OrderDto>("engineering", { search: query || undefined });
  const orders = pageData?.data || [];

  // ECO Query & Mutations
  const ecosQuery = useQuery({
    queryKey: ["engineering", "ecos"],
    queryFn: async () => {
      const res = await apiRequest<{ data: EcoDto[] }>("/api/engineering/change-orders");
      return res.data;
    },
    enabled: activeTab === "ecos",
  });

  const [showEcoModal, setShowEcoModal] = useState(false);
  const [ecoTitle, setEcoTitle] = useState("");
  const [ecoCategory, setEcoCategory] = useState("PROCESS_IMPROVEMENT");
  const [ecoDescription, setEcoDescription] = useState("");

  const createEcoMutation = useMutation({
    mutationFn: async (input: { title: string; reasonCategory: string; description?: string }) => {
      return apiRequest("/api/engineering/change-orders", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engineering", "ecos"] });
      setShowEcoModal(false);
      setEcoTitle("");
      setEcoDescription("");
    },
  });

  const approveEcoMutation = useMutation({
    mutationFn: async (ecoId: string) => {
      return apiRequest("/api/engineering/change-orders/" + ecoId + "/approve", {
        method: "POST",
        body: JSON.stringify({ autoApplyToRunningJobs: true }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engineering", "ecos"] });
    },
  });

  // Substitutes Query & Mutations
  const substitutesQuery = useQuery({
    queryKey: ["engineering", "substitutes"],
    queryFn: async () => {
      const res = await apiRequest<{ data: SubstituteDto[] }>("/api/engineering/substitutes");
      return res.data;
    },
    enabled: activeTab === "substitutes",
  });

  const [showSubModal, setShowSubModal] = useState(false);

  const itemsQuery = useQuery({
    queryKey: ["items", "list"],
    queryFn: async () => {
      const res = await apiRequest<{ data: Array<{ id: string; code: string; name: string }> }>("/api/items");
      return res.data;
    },
    enabled: showSubModal,
  });
  const [origItemId, setOrigItemId] = useState("");
  const [subItemId, setSubItemId] = useState("");
  const [ratio, setRatio] = useState("1.0");
  const [subNotes, setSubNotes] = useState("");

  const registerSubMutation = useMutation({
    mutationFn: async (input: { originalItemId: string; substituteItemId: string; conversionRatio: number; notes?: string }) => {
      return apiRequest("/api/engineering/substitutes", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engineering", "substitutes"] });
      setShowSubModal(false);
      setOrigItemId("");
      setSubItemId("");
      setRatio("1.0");
      setSubNotes("");
    },
  });

  return (
    <div className="page-stack">
      <PageHeader
        title="Engineering Hub"
        description="Engineering review queue, drawing specs, Engineering Change Orders (ECO), and BOM material substitutes."
        actions={
          activeTab === "ecos" ? (
            <Button variant="primary" onClick={() => setShowEcoModal(true)} icon="plus">
              Create ECO
            </Button>
          ) : activeTab === "substitutes" ? (
            <Button variant="primary" onClick={() => setShowSubModal(true)} icon="plus">
              Register Substitute
            </Button>
          ) : undefined
        }
      />

      {/* Navigation Tabs */}
      <div className="flex border-b border-line gap-6 text-xs font-semibold">
        {[
          { id: "orders", label: "Review Queue (" + orders.length + ")" },
          { id: "ecos", label: "Engineering Change Orders (ECO)" },
          { id: "substitutes", label: "Approved Material Substitutes" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as any)}
            className={"pb-3 pt-1 border-b-2 transition-colors " + (activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: Review Queue Orders */}
      {activeTab === "orders" && (
        <div className="space-y-4">
          <ListSearch value={search} onChange={setSearch} placeholder="Search order, customer or item…" label="Search engineering orders" />

          {isPending ? (
            <LoadingState message="Loading engineering review queue…" />
          ) : error ? (
            <ErrorState title="Failed to load engineering orders" onRetry={() => refetch()} />
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white border-line">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b bg-surface text-muted font-semibold uppercase tracking-wider border-line">
                    <th className="p-3">Order Number</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Target Item</th>
                    <th className="p-3">Engineering Status</th>
                    <th className="p-3">Open Questions</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-ink">
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted">
                        No orders in engineering review queue.
                      </td>
                    </tr>
                  ) : (
                    orders.map((o) => {
                      const latestEng = o.engineeringRevisions?.[0];
                      const openQuestionsCount = o.questions?.filter((q) => q.status === "OPEN").length || 0;
                      return (
                        <tr key={o.id} className="hover:bg-surface-muted transition-colors">
                          <td className="p-3 font-mono font-bold text-primary">{o.orderNumber}</td>
                          <td className="p-3">{o.customer?.name}</td>
                          <td className="p-3">{o.item?.name}</td>
                          <td className="p-3">
                            <Badge
                              variant={
                                latestEng?.status === "APPROVED"
                                  ? "success"
                                  : latestEng?.status === "REVIEW"
                                  ? "blue"
                                  : "default"
                              }
                            >
                              Rev {latestEng?.revisionNumber || 1} · {latestEng?.status || "DRAFT"}
                            </Badge>
                          </td>
                          <td className="p-3">
                            {openQuestionsCount > 0 ? (
                              <span className="text-xs font-bold text-danger">
                                {openQuestionsCount} blocking question(s)
                              </span>
                            ) : (
                              <span className="text-xs text-muted">None</span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <Link href={"/engineering/orders/" + o.id} className="btn">
                              Review Specs & BOM
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
          <Pagination {...pagination} />
        </div>
      )}

      {/* TAB 2: Engineering Change Orders (ECO) */}
      {activeTab === "ecos" && (
        <div className="space-y-4">
          {ecosQuery.isLoading ? (
            <LoadingState message="Loading Engineering Change Orders..." />
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white border-line">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b bg-surface text-muted font-semibold uppercase tracking-wider border-line">
                    <th className="p-3">ECO Number</th>
                    <th className="p-3">Title & Scope</th>
                    <th className="p-3">Reason Category</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Effective Date</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-ink">
                  {(!ecosQuery.data || ecosQuery.data.length === 0) ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted">
                        No Engineering Change Orders registered yet.
                      </td>
                    </tr>
                  ) : (
                    ecosQuery.data.map((eco) => (
                      <tr key={eco.id} className="hover:bg-surface-muted transition-colors">
                        <td className="p-3 font-mono font-bold text-ink">{eco.ecoNumber}</td>
                        <td className="p-3">
                          <strong className="text-ink">{eco.title}</strong>
                          {eco.description && <p className="text-muted mt-0.5">{eco.description}</p>}
                        </td>
                        <td className="p-3 font-mono text-muted">{eco.reasonCategory}</td>
                        <td className="p-3">
                          <Badge variant={eco.status === "APPLIED" || eco.status === "APPROVED" ? "success" : eco.status === "REJECTED" ? "danger" : "warning"}>
                            {eco.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-muted">
                          {eco.effectiveDate ? new Date(eco.effectiveDate).toLocaleDateString() : "Immediate"}
                        </td>
                        <td className="p-3 text-right">
                          {(eco.status === "DRAFT" || eco.status === "SUBMITTED") && (
                            <Button
                              size="small"
                              variant="primary"
                              disabled={approveEcoMutation.isPending}
                              onClick={() => approveEcoMutation.mutate(eco.id)}
                            >
                              Approve & Apply to Jobs
                            </Button>
                          )}
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

      {/* TAB 3: Approved Material Substitutes */}
      {activeTab === "substitutes" && (
        <div className="space-y-4">
          {substitutesQuery.isLoading ? (
            <LoadingState message="Loading approved material substitutes..." />
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white border-line">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b bg-surface text-muted font-semibold uppercase tracking-wider border-line">
                    <th className="p-3">Original Item</th>
                    <th className="p-3">Approved Substitute</th>
                    <th className="p-3 font-mono">Conversion Ratio</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Engineering Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-ink">
                  {(!substitutesQuery.data || substitutesQuery.data.length === 0) ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-muted">
                        No approved material substitutes configured.
                      </td>
                    </tr>
                  ) : (
                    substitutesQuery.data.map((sub) => (
                      <tr key={sub.id} className="hover:bg-surface-muted transition-colors">
                        <td className="p-3 font-medium text-ink">
                          {sub.originalItemName}
                          <span className="block text-muted font-mono text-xs">{sub.originalItemCode}</span>
                        </td>
                        <td className="p-3 font-medium text-primary">
                          {sub.substituteItemName}
                          <span className="block text-muted font-mono text-xs">{sub.substituteItemCode}</span>
                        </td>
                        <td className="p-3 font-mono font-semibold text-ink">
                          {formatQuantity(BigInt(sub.conversionRatioAtoms))}x
                        </td>
                        <td className="p-3">
                          <Badge variant={sub.isActive ? "success" : "default"}>
                            {sub.isActive ? "ACTIVE" : "DEPRECATED"}
                          </Badge>
                        </td>
                        <td className="p-3 text-muted">{sub.notes || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create ECO Modal */}
      {showEcoModal && (
        <Dialog
          isOpen
          onClose={() => setShowEcoModal(false)}
          title="Create Engineering Change Order (ECO)"
          size="md"
          pending={createEcoMutation.isPending}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createEcoMutation.mutate({
                title: ecoTitle.trim(),
                reasonCategory: ecoCategory,
                description: ecoDescription.trim() || undefined,
              });
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                ECO Title & Scope
              </label>
              <Input
                type="text"
                required
                value={ecoTitle}
                onChange={(e) => setEcoTitle(e.target.value)}
                placeholder="e.g. Upgrade spindle bearing tolerance specification"
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Reason Category
              </label>
              <Select
                value={ecoCategory}
                onChange={(e) => setEcoCategory(e.target.value)}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              >
                <option value="PROCESS_IMPROVEMENT">Process & Yield Improvement</option>
                <option value="COST_REDUCTION">Cost Reduction / Tooling</option>
                <option value="DEFECT_CORRECTION">Defect Correction / Quality Alert</option>
                <option value="CUSTOMER_CHANGE">Customer Design Revision</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Technical Justification & Notes
              </label>
              <Textarea
                value={ecoDescription}
                onChange={(e) => setEcoDescription(e.target.value)}
                placeholder="Detailed revision rationale, affected drawings, or tool wear observations..."
                rows={3}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              />
            </div>

            <div className="dialog-actions">
              <Button onClick={() => setShowEcoModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={createEcoMutation.isPending}>
                {createEcoMutation.isPending ? "Creating..." : "Register ECO"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Register Material Substitute Modal */}
      {showSubModal && (
        <Dialog
          isOpen
          onClose={() => setShowSubModal(false)}
          title="Register Material Substitute"
          size="md"
          pending={registerSubMutation.isPending}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              registerSubMutation.mutate({
                originalItemId: origItemId,
                substituteItemId: subItemId,
                conversionRatio: parseFloat(ratio) || 1.0,
                notes: subNotes.trim() || undefined,
              });
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Original Drawing / BOM Item
              </label>
              <Select
                value={origItemId}
                onChange={(e) => setOrigItemId(e.target.value)}
                required
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              >
                <option value="">Select original material...</option>
                {itemsQuery.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.code})
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Approved Substitute Material
              </label>
              <Select
                value={subItemId}
                onChange={(e) => setSubItemId(e.target.value)}
                required
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              >
                <option value="">Select substitute material...</option>
                {itemsQuery.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.code})
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Conversion Ratio (1 unit original = X units substitute)
              </label>
              <Input
                type="number"
                step="0.000001"
                min="0.000001"
                required
                value={ratio}
                onChange={(e) => setRatio(e.target.value)}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Approval Notes / Material Spec
              </label>
              <Textarea
                value={subNotes}
                onChange={(e) => setSubNotes(e.target.value)}
                placeholder="Grade equivalence certification, supplier conformance note..."
                rows={3}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              />
            </div>

            <div className="dialog-actions">
              <Button onClick={() => setShowSubModal(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={registerSubMutation.isPending || !origItemId || !subItemId}
              >
                {registerSubMutation.isPending ? "Registering..." : "Save Substitute"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
