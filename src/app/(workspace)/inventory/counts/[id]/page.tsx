'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { StockCountDetailView } from '@/features/inventory/components/StockCountDetailView';
import Link from 'next/link';

export default function StockCountDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  return (
    <div className="page-stack">
      <StockCountDetailView countId={id} />
    </div>
  );
}
