import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  const isText = typeof description === 'string' || typeof description === 'number';

  return (
    <div className="page-header">
      <div className="page-header-copy">
        <h1>{title}</h1>
        {description && (
          isText ? (
            <p className="page-header-desc">{description}</p>
          ) : (
            <div className="page-header-desc">{description}</div>
          )
        )}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}
