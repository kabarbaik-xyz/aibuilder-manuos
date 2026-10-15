import React from 'react';
import { StockCountForm } from '@/features/inventory/components/StockCountForm';
import { PageHeader } from '@/components/ui/page-header';
import { ButtonLink } from '@/components/ui/button-link';
import { ArrowLeft } from 'lucide-react';

export default function NewStockCountPage() {
  return (
    <div className="page-stack">
      <PageHeader
        title="Record Physical Inventory Count"
        description="Capture counted stock levels against current system book snapshots. Discrepancies will be submitted for owner approval."
        actions={
          <ButtonLink href="/inventory/counts">
            <span className="inline-flex items-center gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Stock Counts
            </span>
          </ButtonLink>
        }
      />
      <StockCountForm />
    </div>
  );
}
