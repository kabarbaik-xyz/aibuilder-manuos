import React from 'react';
import { TransferStockForm } from '@/features/inventory/components/TransferStockForm';
import { PageHeader } from '@/components/ui/page-header';
import { ButtonLink } from '@/components/ui/button-link';
import { ArrowLeft } from 'lucide-react';

export default function NewTransferPage() {
  return (
    <div className="page-stack">
      <PageHeader
        title="Transfer Stock Between Locations"
        description="Internal warehouse relocation preserving global quantity conservation."
        actions={
          <ButtonLink href="/inventory">
            <span className="inline-flex items-center gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Inventory
            </span>
          </ButtonLink>
        }
      />
      <TransferStockForm />
    </div>
  );
}
