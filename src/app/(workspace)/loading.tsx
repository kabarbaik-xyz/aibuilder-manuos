export default function WorkspaceLoading() {
  return (
    <div className="page-stack route-loading" role="status" aria-busy="true">
      <span className="sr-only">Loading workspace page…</span>
      <div className="route-loading-heading" aria-hidden="true">
        <span className="route-skeleton route-skeleton-title" />
        <span className="route-skeleton route-skeleton-description" />
      </div>
      <section className="route-loading-panel" aria-hidden="true">
        <div className="route-loading-toolbar">
          <span className="route-skeleton route-skeleton-toolbar-primary" />
          <span className="route-skeleton route-skeleton-toolbar-secondary" />
        </div>
        <div className="route-loading-content">
          {Array.from({ length: 5 }, (_, row) => (
            <div className="route-loading-row" key={row}>
              <span className="route-skeleton route-skeleton-cell route-skeleton-cell-wide" />
              <span className="route-skeleton route-skeleton-cell route-skeleton-cell-medium" />
              <span className="route-skeleton route-skeleton-cell route-skeleton-cell-short" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
