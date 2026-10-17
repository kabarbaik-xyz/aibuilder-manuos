'use client';

import Link from 'next/link';
import { Panel } from '../../components/ui/panel';

export function RecoveryStudio() {
  return (
    <Panel className="space-y-3 p-4">
      <h2 className="text-sm font-semibold text-ink">Recovery generation unavailable</h2>
      <p className="text-xs text-muted">
        The previous simulator assumed dates and capacity. New options stay disabled until schedule, materials, qualified resources and shipment constraints are evaluated together.
      </p>
      <Link href="/ai/recovery" className="btn soft w-fit">Review saved proposals</Link>
    </Panel>
  );
}
