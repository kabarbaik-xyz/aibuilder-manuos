import React from 'react';
import { AppShell } from '@/components/app-shell';
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
    <AppShell
      breadcrumb={
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Operations</span>
          <span>/</span>
          <span>Shop Floor</span>
          <span>/</span>
          <span className="text-slate-100 font-medium font-mono">{id.slice(0, 8)}</span>
        </div>
      }
      activeTitle="Operator Workstation"
    >
      <div className="p-6 max-w-7xl mx-auto">
        <ShopFloorWorkstationView taskId={id} />
      </div>
    </AppShell>
  );
}
