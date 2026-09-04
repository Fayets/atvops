import { Link } from 'react-router-dom';
import { formatValue } from '../../lib/format.js';
import Delta from '../ui/Delta.jsx';
import Icon from '../ui/Icon.jsx';
import SourceTag from '../ui/SourceTag.jsx';

/**
 * Resumen mini de un área, con link a la sección completa.
 * @param {{ area: import('../../data/types.js').ResumenArea }} props
 */
export default function AreaCard({ area }) {
  return (
    <Link to={area.href} className="area-card">
      <header>
        <h3>{area.titulo}</h3>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>· {area.dueno}</span>
        <Icon name="arrow" size={15} className="arrow" />
      </header>

      <div>
        {area.metricas.map((m) => (
          <div key={m.id} className="area-metric">
            <span className="l" title={m.label}>{m.label}</span>
            <span className="v">
              <span className="num">{formatValue(m.value, m.format)}</span>
              <Delta value={m.value} previous={m.previous} good={m.good} />
            </span>
          </div>
        ))}
      </div>

      <SourceTag sourceId={area.metricas[0]?.sourceId ?? 'manual'} updatedAt={area.metricas[0]?.updatedAt} />
    </Link>
  );
}
