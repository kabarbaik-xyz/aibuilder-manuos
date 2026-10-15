import React from 'react';
import { ReturnMaterialForm } from '@/features/inventory/components/ReturnMaterialForm';
import { PageHeader } from '@/components/ui/page-header';
import { ButtonLink } from '@/components/ui/button-link';
import { ArrowLeft } from 'lucide-react';

export default function NewReturnPage() {
  return (
    <div className="page-stack">
      <PageHeader
        title="Return Unused Material from WIP"
        description="Return leftover materials from workstation WIP back to warehouse storage without fabricating new supplier receipts."
        actions={
          <ButtonLink href="/inventory">
            <span className="inline-flex items-center gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Inventory
            </span>
          </ButtonLink>
        }
      />
      <ReturnMaterialForm />
    </div>
  );
}
