'use client';

import React from 'react';
import { OrderForm } from '@/features/orders/components/order-form';

export default function NewOrderIntakePage() {
  return (
    <div className="p-6">
      <OrderForm />
    </div>
  );
}
