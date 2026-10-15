'use client';

import React from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { SupplyOrderForm } from '@/features/supply/components/supply-order-form';

export default function NewSupplyOrderPage() {
  return (
    <AppShell
      breadcrumb={
        <div className="flex items-center gap-2 text-xs text-muted">
          <Link href="/supply-orders" className="hover:text-white">Supply Orders</Link>
          <span>/</span>
          <span className="text-white">New Purchase Order</span>
        </div>
      }
      activeTitle="New Purchase Order"
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create Supply Purchase Order</h1>
          <p className="text-sm text-muted">
            Issue procurement orders to approved suppliers for raw materials and component replenishment.
          </p>
        </div>

        <SupplyOrderForm />
      </div>
    </AppShell>
  );
}
