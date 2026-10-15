import React from 'react';
import { AppShell } from '@/components/app-shell';
import { PlanningScheduleView } from '@/features/planning/components/PlanningScheduleView';

export const metadata = {
  title: 'Production Planning & Scheduling | ManuOS',
  description: 'Deterministic timezone-aware production routing with shifts, critical path CPM, and resource booking.',
};

export default function PlanningPage() {
  return (
    <AppShell
      breadcrumb={
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Operations</span>
          <span>/</span>
          <span className="text-slate-100 font-medium">Production Planning</span>
        </div>
      }
      activeTitle="Production Planning & Critical Path"
    >
      <div className="p-6 max-w-7xl mx-auto">
        <PlanningScheduleView />
      </div>
    </AppShell>
  );
}
