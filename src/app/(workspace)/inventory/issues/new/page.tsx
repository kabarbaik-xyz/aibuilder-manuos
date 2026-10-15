import React from 'react';
import { IssueMaterialForm } from '@/features/inventory/components/IssueMaterialForm';
import Link from 'next/link';

export default function NewIssuePage() {
  return (
    <div className="page-stack">
      <IssueMaterialForm />
    </div>
  );
}
