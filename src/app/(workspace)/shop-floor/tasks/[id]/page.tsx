import React from 'react';
import { ShopFloorWorkstationView } from '@/features/execution/components/ShopFloorWorkstationView';

export const metadata = {
  title: 'Workstation Telemetry & Work Sessions | ManuOS',
  description: 'Shop floor execution workstation with real server session timestamps and material custody.',
};

export default async function ShopFloorTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="page-stack">
      <div className="max-w-7xl mx-auto">
        <ShopFloorWorkstationView taskId={id} />
      </div>
    </div>
  );
}
