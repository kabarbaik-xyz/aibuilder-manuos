'use client';

import { WorkspaceBrainDrawer } from '@/features/brain/workspace-brain-drawer';
import { Panel } from '@/components/ui/panel';
import type { BrainQuestionContext } from '@/server/ai/brain';

export function WorkspaceAssistantPage({ context, contextLabel }: { context?: BrainQuestionContext; contextLabel?: string }) {
  return (
    <Panel className="p-0 overflow-hidden" style={{ height: 'min(68dvh, 760px)', minHeight: 440 }}>
      <WorkspaceBrainDrawer initialContext={context} initialContextLabel={contextLabel} />
    </Panel>
  );
}
