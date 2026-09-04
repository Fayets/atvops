import { formatFecha } from '../../lib/format.js';
import { useLocalState } from '../../lib/hooks.js';
import Sparkline from '../charts/Sparkline.jsx';
import Card from '../ui/Card.jsx';
import Delta from '../ui/Delta.jsx';
import Icon from '../ui/Icon.jsx';
import Pill from '../ui/Pill.jsx';

/**
 * Contador manual de pedidos de datos. Es el único KPI que se carga a mano a
 * propósito: mide cuántas veces por semana el equipo tuvo que preguntar algo
 * que debería haber estado en el tablero. El objetivo es cero.
 *
 * @param {{ pedidos: import('../../data/types.js').PedidoDato[],
 *           semanas: { semana: string, pedidos: number }[] }} props
 */
export default function PedidosPanel({ pedidos, semanas }) {
  const base = semanas[semanas.length - 1].pedidos;
  const previa = semanas[semanas.length - 2].pedidos;
  const [conteo, setConteo] = useLocalState('atv-ops:pedidos-semana', base);
  const sinCubrir = pedidos.filter((p) => !p.yaEstaEnTablero).length;

  return (
    <Card
      title="Pedidos de datos · esta semana"
      sub="Veces que me pidieron un número que debería estar acá"
      actions={
        <button className="btn primary" onClick={() => setConteo((n) => n + 1)}>
          <Icon name="mas" size={13} />
          Registrar
        </button>
      }
      flush
      foot={`${sinCubrir} de los últimos ${pedidos.length} pedidos todavía no tienen lugar en el tablero.`}
    >
      <div style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="contador">
          <span className="n num">{conteo}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Delta value={conteo} previous={previa} good="down" sufijo="vs semana pasada" />
            <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Objetivo: 0</span>
          </div>
          <div className="contador-btns" style={{ marginLeft: 'auto' }}>
            <button className="btn icon" onClick={() => setConteo((n) => Math.max(0, n - 1))} aria-label="Restar un pedido">
              <Icon name="menos" size={13} />
            </button>
            <button className="btn icon" onClick={() => setConteo(base)} aria-label="Volver al valor de la fuente">
              <Icon name="refresh" size={13} />
            </button>
          </div>
        </div>
        <Sparkline data={[...semanas.map((s) => s.pedidos).slice(0, -1), conteo]} height={44} />
        <div className="legend">
          <span className="k">
            <i style={{ background: 'var(--brand)' }} />
            {semanas[0].semana} → {semanas[semanas.length - 1].semana}
          </span>
        </div>
      </div>

      <div className="lista">
        {pedidos.slice(0, 5).map((p) => (
          <div key={p.id} className="lista-item">
            <span className="who">{p.quien}</span>
            <span className="q">{p.pregunta}</span>
            <span className="right">
              {!p.yaEstaEnTablero && <Pill tone="warn">falta en el tablero</Pill>}
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{formatFecha(p.fechaAt)}</span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
