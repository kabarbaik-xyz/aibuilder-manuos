'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormErrorSummary } from '@/components/ui/form-errors';
import { Icon, type IconName } from '@/components/icons';

type ExtraMasterAction = {
  label: string;
  icon: IconName;
  onSelect: () => void;
};

function IconAction({ label, icon, onSelect }: ExtraMasterAction) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={(event) => { event.stopPropagation(); onSelect(); }}
        className="inline-flex size-8 items-center justify-center rounded-md border border-line bg-surface text-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <Icon name={icon} className="size-4" />
      </button>
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {label}
      </span>
    </span>
  );
}

export function MasterRowActions({
  onEdit,
  onArchive,
  canEdit = true,
  canArchive = true,
  extraActions = [],
}: {
  onEdit: () => void;
  onArchive: () => void;
  canEdit?: boolean;
  canArchive?: boolean;
  extraActions?: ExtraMasterAction[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = `master-row-actions-${useId().replaceAll(':', '')}`;
  const actions = [
    ...(canEdit ? [{ label: 'Edit', icon: 'edit' as const, onSelect: onEdit }] : []),
    ...(canArchive ? [{ label: 'Archive', icon: 'archive' as const, onSelect: onArchive }] : []),
    ...extraActions,
  ];

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div ref={menuRef} className="relative flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
      {actions.length <= 2 ? actions.map((action) => <IconAction key={action.label} {...action} />) : (
        <>
          <span className="group relative inline-flex">
            <button
              type="button"
              aria-label="More actions"
              aria-expanded={isOpen}
              aria-controls={menuId}
              title="More actions"
              onClick={() => setIsOpen((open) => !open)}
              className="inline-flex size-8 items-center justify-center rounded-md border border-line bg-surface text-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Icon name="more-horizontal" className="size-4" />
            </button>
            {!isOpen && <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">More actions</span>}
          </span>
          {isOpen && (
            <div id={menuId} className="absolute right-0 top-full z-40 mt-1 min-w-40 rounded-lg border border-line bg-surface p-1 shadow-lg">
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => { setIsOpen(false); action.onSelect(); }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none"
                >
                  <Icon name={action.icon} className="size-4 text-muted" />
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function ArchiveMasterDialog({
  isOpen,
  onClose,
  endpoint,
  recordName,
  onArchived,
}: {
  isOpen: boolean;
  onClose: () => void;
  endpoint: string;
  recordName: string;
  onArchived: () => unknown | Promise<unknown>;
}) {
  const [error, setError] = useState<ApiError | null>(null);
  const queryClient = useQueryClient();
  useEffect(() => { if (isOpen) setError(null); }, [isOpen, endpoint]);
  const resource = endpoint.match(/\/api\/resources\/catalog\/([^/]+)/)?.[1]
    || endpoint.match(/\/api\/resources\/([^/]+)/)?.[1]
    || endpoint.match(/\/api\/([^/]+)/)?.[1];
  const archive = useMutation({
    mutationFn: () => apiRequest(endpoint, { method: 'DELETE' }),
    onSuccess: async () => {
      setError(null);
      if (resource) await queryClient.invalidateQueries({ queryKey: [resource] });
      await onArchived();
      onClose();
    },
    onError: (reason) => setError(reason as ApiError),
  });

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => { if (!archive.isPending) { setError(null); onClose(); } }}
      title={`Archive ${recordName}?`}
      subtitle="This record will leave active selections while its history is retained."
      size="sm"
      pending={archive.isPending}
      footer={<>
        <Button onClick={onClose} disabled={archive.isPending}>Cancel</Button>
        <Button variant="primary" onClick={() => archive.mutate()} disabled={archive.isPending}>
          {archive.isPending ? 'Archiving…' : 'Archive'}
        </Button>
      </>}
    >
      <div className="page-stack">
        <p>Archive <strong>{recordName}</strong>? Existing transaction and production history will remain available.</p>
        <FormErrorSummary error={error} />
      </div>
    </Dialog>
  );
}
