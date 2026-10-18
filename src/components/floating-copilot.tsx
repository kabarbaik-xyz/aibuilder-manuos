'use client';

import React from 'react';
import { useUiStore } from '../store/ui-store';
import { Icon } from './icons';

export function FloatingCopilot() {
  const { openModal } = useUiStore();

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
