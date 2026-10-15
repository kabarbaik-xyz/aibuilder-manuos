"use client";

import React from "react";
import Link from "next/link";
import { useListSearch, usePaginatedList } from "@/lib/api/use-paginated-list";
import { Pagination } from "@/components/ui/pagination";
import { ListSearch } from "@/components/ui/list-search";
import type { SupplyReceiptDTO } from "@/server/modules/supply/contracts";
import { ErrorState } from "@/components/ui/resource-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { formatQuantity } from "@/domain/quantity";
import {
  Building2,
  Clock,
  User,
  MapPin,
  Tag,
  ExternalLink,
  FileText,
  PackageCheck,
  ArrowRight,
} from "lucide-react";

export default function InventoryReceiptsPage() {
  const { search, setSearch, query } = useListSearch();
  const {
    data: pageData,
    isLoading,
    refetch,
    error: queryError,
    pagination,
  } = usePaginatedList<SupplyReceiptDTO>("receipts", {
    search: query || undefined,
  });
  const receipts = pageData?.data || [];

  if (queryError) {
    return (
      <div className="page-stack">
        <PageHeader title="Inbound Receipts" />
        <ErrorState message={queryError.message} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Inbound Receipts"
        description="Chronological log of verified incoming shipments posted into inventory balances."
        actions={
          <ButtonLink href="/supply-orders">
            <span className="inline-flex items-center gap-1.5">
              <span>View Purchase Orders</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </ButtonLink>
        }
      />

      <ListSearch
        value={search}
        onChange={setSearch}
        placeholder="Search receipt, PO, supplier or item…"
        label="Search inbound receipts"
      />

      <Panel className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-16 text-center text-xs text-muted flex flex-col items-center justify-center gap-2">
            <Clock className="w-5 h-5 animate-spin text-primary" />
            <span>Loading inbound receipts ledger...</span>
          </div>
        ) : !receipts || receipts.length === 0 ? (
          <div className="p-16 text-center text-muted space-y-2">
            <PackageCheck className="w-8 h-8 text-muted mx-auto stroke-1" />
            <p className="text-sm font-semibold text-ink">
              No inbound receipts recorded
            </p>
            <p className="text-xs max-w-sm mx-auto">
              Receive incoming shipments against approved purchase orders to
              post double-entry inventory ledger balances.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {receipts.map((rec) => (
              <div
                key={rec.id}
                className="p-5 space-y-3.5 hover:bg-surface-muted/20 transition-colors"
              >
                {/* Consignment Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono font-bold text-xs bg-surface text-ink px-2.5 py-1 rounded border border-line shadow-2xs">
                      {rec.receiptNumber}
                    </span>
                    <span className="text-muted text-xs">•</span>
                    <Link
                      href={`/supply-orders/${rec.supplyOrderId}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      <span>PO {rec.orderNumber}</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                    <span className="text-muted text-xs">•</span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted">
                      <Building2 className="w-3.5 h-3.5 text-muted" />
                      <strong className="text-ink font-medium">
                        {rec.supplierName}
                      </strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-muted" />
                      {new Date(rec.receivedDate).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="text-line">•</span>
                    <span className="inline-flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-muted" />
                      <strong className="text-ink font-normal">
                        {rec.receivedByName}
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Line Items */}
                <div className="space-y-2">
                  {rec.lines.map((l) => (
                    <div
                      key={l.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-surface border border-line/70 hover:border-line transition-all shadow-2xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink text-xs">
                            {l.itemName}
                          </span>
                          <span className="font-mono text-xs text-muted bg-surface-muted px-1.5 py-0.5 rounded border border-line">
                            {l.itemCode}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-muted" />
                            Location:{" "}
                            <strong className="text-ink font-mono font-medium">
                              {l.locationCode}
                            </strong>
                          </span>
                          <span className="text-line">•</span>
                          <span className="inline-flex items-center gap-1">
                            <Tag className="w-3 h-3 text-muted" />
                            Lot:{" "}
                            <strong className="text-primary font-mono font-medium">
                              {l.lotNumber || "NO-LOT"}
                            </strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-mono font-bold text-success bg-emerald-50 border border-emerald-200">
                          +{formatQuantity(l.receivedAtoms)} units
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Optional Notes */}
                {rec.notes && (
                  <div className="text-xs text-muted flex items-start gap-1.5 bg-surface-muted/60 p-2.5 rounded-lg border border-line/60">
                    <FileText className="w-3.5 h-3.5 text-muted mt-0.5 shrink-0" />
                    <span>{rec.notes}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Pagination {...pagination} />
    </div>
  );
}
