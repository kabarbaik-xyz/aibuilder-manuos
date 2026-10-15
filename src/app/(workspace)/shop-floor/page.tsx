import React from 'react';
import { ShopFloorTaskListView } from '@/features/execution/components/ShopFloorTaskListView';

export const metadata = {
  title: 'Shop Floor Workstation Hub | ManuOS',
  description: 'Operator execution station with live server work sessions, material custody, and predecessor guards.',
};

export default function ShopFloorPage() {
  return (
    <div className="page-stack">
      <div className="max-w-7xl mx-auto">
        <ShopFloorTaskListView />
      </div>
    </div>
  );
}
