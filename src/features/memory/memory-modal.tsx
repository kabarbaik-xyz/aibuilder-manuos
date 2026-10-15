'use client';

import React from 'react';
import { useGraphStore } from '../../store/graph-store';
import { Icon } from '../../components/icons';
import { Button } from '../../components/ui/button';

export function MemoryModal() {
  const { history, closeModal } = useGraphStore();

  return (
    <div>
      <div className="memory-evidence">
        <div className="evidence-number">
          +18%
          <span>Average overrun · 3 completed runs</span>
        </div>
      </div>

      <table className="drawer-table">
        <thead>
          <tr>
            <th>RUN</th>
            <th>PLANNED</th>
            <th>ACTUAL</th>
            <th>OVERRUN</th>
          </tr>
        </thead>
        <tbody>
          {[
            [1, 10.0, 11.5, 15],
            [2, 10.0, 11.8, 18],
            [3, 10.0, 12.1, 21],
          ].map(([r, p, a, v]) => (
            <tr key={r}>
              <td>Bracket run {r}</td>
              <td>{p} h</td>
              <td>{a} h</td>
              <td className="warning-text font-bold">+{v}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="recommendation mt">
        <Icon name="book" />
        <div>
          <strong>Use routing rev 2. Add a 15% planning allowance.</strong>
          <p>
            Routing rev 2 completed on time in seeded history with zero defects.
            The 15% allowance is an explicit planning recommendation, not a measured mathematical average.
          </p>
        </div>
      </div>

      <p className="approval-note">
        Recommendations do not change an active order automatically. Historical evidence informs engineering review.
      </p>

      <div className="dialog-actions mt">
        <Button variant="default" fullWidth onClick={closeModal}>
          Close evidence
        </Button>
      </div>
    </div>
  );
}
