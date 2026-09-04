import { formatValue } from '../../lib/format.js';
import { ESTADO_RITMO } from '../../lib/pacing.js';
import Pill from '../ui/Pill.jsx';

/**
 * Una meta con su ritmo: cuánto llevamos, cuánto deberíamos llevar a hoy
 * (la marca en la barra) y qué hace falta por semana.
 * @param {{ meta: import('../../data/types.js').Meta, ritmo: object, compacta?: boolean }} props
 */
export default function MetaRow({ meta, ritmo, compacta = false }) {
  const actual = meta.acumulado.at(-1) ?? 0;
  const estado = ESTADO_RITMO[ritmo.estado];
  const pct = Math.min(100, ritmo.pctMeta * 100);
  const esperadoPct = Math.min(100, ritmo.fraccion * 100);
  const tono = ritmo.estado === 'critico' ? 'var(--brand)' : ritmo.estado === 'atrasado' ? 'var(--warn)' : 'var(--ok)';

  return (
    <div className={`meta-row${compacta ? ' compacta' : ''}`}>
      <div className="meta-row-top">
        <span className="meta-row-nombre">{meta.nombre}</span>
        <span className="meta-row-valor num">
          {formatValue(actual, meta.format)}
          <span className="dim"> / {formatValue(meta.meta, meta.format)}</span>
        </span>
        <Pill tone={estado.tone}>{estado.label}</Pill>
      </div>

      <div className="meta-bar" title={`Esperado a hoy: ${formatValue(Math.round(ritmo.esperado), meta.format)}`}>
        <span className="meta-bar-fill" style={{ width: `${pct}%`, background: tono }} />
        <span className="meta-bar-tick" style={{ left: `${esperadoPct}%` }} />
      </div>

      {!compacta && (
        <div className="meta-row-foot">
          <span>
            proyección <b className="num" style={{ color: ritmo.llega ? 'var(--ok)' : tono }}>{formatValue(Math.round(ritmo.proyeccion), meta.format)}</b>
          </span>
          <span>
            hace falta <b className="num">{formatValue(Math.round(ritmo.necesarioSemana), meta.format)}</b>/sem
          </span>
        </div>
      )}
    </div>
  );
}
