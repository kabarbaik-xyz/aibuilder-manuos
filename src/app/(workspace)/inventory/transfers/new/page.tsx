import React from 'react';
import { TransferStockForm } from '@/features/inventory/components/TransferStockForm';
import Link from 'next/link';

export default function NewTransferPage() {
  return (
    <div className="page-stack">
      <TransferStockForm />
    </div>
  );
}
