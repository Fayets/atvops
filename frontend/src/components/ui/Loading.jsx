/** Esqueletos de carga: la grilla no salta cuando llegan los datos. */
export function SkeletonKpis({ n = 4 }) {
  return (
    <div className="kpi-grid">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 148 }} />
      ))}
    </div>
  );
}

export function SkeletonBlock({ height = 280 }) {
  return <div className="skeleton" style={{ height }} />;
}

/**
 * @param {{ error: Error }} props
 */
export function ErrorState({ error }) {
  return (
    <div className="card">
      <div className="empty" style={{ color: 'var(--brand-hi)' }}>
        No se pudieron cargar los datos: {error.message}
      </div>
    </div>
  );
}
