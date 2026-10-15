import React from 'react';
import { ReturnMaterialForm } from '@/features/inventory/components/ReturnMaterialForm';
import Link from 'next/link';

export default function NewReturnPage() {
  return (
    <div className="page-stack">
      <ReturnMaterialForm />
    </div>
  );
}
