import React from 'react';
import { AppShell } from '@/components/app-shell';
import { ShopFloorTaskListView } from '@/features/execution/components/ShopFloorTaskListView';

export const metadata = {
  title: 'Shop Floor Workstation Hub | ManuOS',
  description: 'Operator execution station with live server work sessions, material custody, and predecessor guards.',
};

export default function ShopFloorPage() {
  return (
    <AppShell
      breadcrumb={
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Operations</span>
          <span>/</span>
          <span className="text-slate-100 font-medium">Shop Floor Workstations</span>
        </div>
      }
      activeTitle="Shop Floor Operations"
    >
      <div className="p-6 max-w-7xl mx-auto">
        <ShopFloorTaskListView />
      </div>
    </AppShell>
  );
}
