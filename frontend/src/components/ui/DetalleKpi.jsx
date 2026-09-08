import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Pill from './Pill.jsx';

/**
 * De dónde sale un número: la lista de canales que lo componen, con link a la
 * ficha del cliente y al chat en vivo.
 * @param {{ metric: import('../../data/types.js').Metric, onClose: () => void }} props
 */
export default function DetalleKpi({ metric, onClose }) {
  const [q, setQ] = useState('');
  const items = metric.detalle?.items ?? [];
  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((i) => i.nombre.toLowerCase().includes(t) || (i.canalId ?? '').toLowerCase().includes(t));
  }, [items, q]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card detalle-kpi" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="detalle-kpi-head">
          <div>
            <div className="eyebrow">De dónde sale este número</div>
            <h3>
              {metric.label} · <span className="num">{items.length}</span> {items.length === 1 ? 'canal' : 'canales'}
            </h3>
            {metric.detalle?.titulo && <p className="modal-desc">{metric.detalle.titulo}</p>}
          </div>
          <button className="btn icon" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        {items.length > 8 && (
          <div className="buscador" style={{ margin: '0 0 10px' }}>
            <span style={{ color: 'var(--text-3)' }}>⌕</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar por nombre o canal" aria-label="Filtrar" />
          </div>
        )}

        <div className="detalle-kpi-lista">
          {filtrados.map((i) => (
            <div key={i.id} className="detalle-kpi-item">
              <div className="detalle-kpi-nombre">
                <span className="strong">{i.nombre}</span>
                <span className="dim"> · #{(i.canalId ?? '').split('/').pop()}</span>
                {i.categoria && <span className="chip" style={{ marginLeft: 8 }}>{i.categoria}</span>}
              </div>
              {i.valor && <Pill tone={i.tono ?? 'plain'}>{i.valor}</Pill>}
              <div className="detalle-kpi-links">
                <Link to={`/fulfillment/clientes/${i.id}`}>Ficha</Link>
                {i.canalId && <Link to={`/fulfillment/chats/${i.canalId}`}>Chat</Link>}
              </div>
            </div>
          ))}
          {!filtrados.length && <div className="empty">Ningún canal coincide.</div>}
        </div>
      </div>
    </div>
  );
}
