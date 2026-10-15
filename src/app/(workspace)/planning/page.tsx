import React from 'react';
import { PlanningScheduleView } from '@/features/planning/components/PlanningScheduleView';

export const metadata = {
  title: 'Production Planning & Scheduling | ManuOS',
  description: 'Deterministic timezone-aware production routing with shifts, critical path CPM, and resource booking.',
};

export default function PlanningPage() {
  return (
    <div className="page-stack">
      <div className="min-w-0 w-full">
        <PlanningScheduleView />
      </div>
    </div>
  );
}
