'use client';

import React from 'react';
import { useGraphStore } from '../store/graph-store';
import { Icon } from './icons';

export function FloatingCopilot() {
  const { openModal } = useGraphStore();

  return (
    <button
      type="button"
      className="floating-copilot-pill"
      onClick={() => openModal('brain')}
      aria-label="Ask AI (⌘J)"
      title="Ask AI (⌘J)"
    >
      <span className="copilot-spark-badge">
        <Icon name="spark" />
      </span>
      <span className="copilot-pill-label">Ask AI</span>
      <kbd className="copilot-pill-kbd">⌘ J</kbd>
    </button>
  );
}
