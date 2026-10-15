'use client';

import React from 'react';
import { useGraphStore } from '../../store/graph-store';
import { Icon } from '../../components/icons';
import { Button } from '../../components/ui/button';

export function AuditModal() {
  const { audit, closeModal } = useGraphStore();

  return (
    <div>
      {audit.map((entry) => (
        <div key={entry.id} className="audit-line">
          <Icon
            name={
              entry.type === 'APPROVAL'
                ? 'check'
                : entry.type === 'DEAL'
                ? 'network'
                : entry.type === 'EXECUTION'
                ? 'work'
                : 'alert'
            }
          />
          <div>
            <strong>{entry.title}</strong>
            <p>
              {entry.detail} · {entry.actor} ({entry.timestamp})
            </p>
          </div>
        </div>
      ))}

      <p className="approval-note">
        Immutable decision trail. All recovery approvals and output records are logged with timestamp and author.
      </p>

      <div className="dialog-actions mt">
        <Button variant="default" fullWidth onClick={closeModal}>
          Close activity log
        </Button>
      </div>
    </div>
  );
}
