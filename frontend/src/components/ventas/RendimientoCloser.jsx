import Card from '../ui/Card.jsx';
import { formatMes, formatValue, mesId } from '../../lib/format.js';
import { getMisLlamadas } from '../../data/api.js';
import { useResource } from '../../lib/hooks.js';
import { useMes } from '../../lib/MesContext.jsx';

/**
 * Cómo viene el mes contra el anterior.
 *
 * Va donde estaba el calendario, que mostraba las mismas llamadas que la lista pero
 * repartidas en una grilla. Los KPIs de arriba dicen cómo viene el mes; lo que no dicen
 * es si eso es mejor o peor que el mes pasado, que es lo único que agrega esta tarjeta.
 *
 * El mes anterior se pide con la misma función que el actual: así las definiciones de
 * show, cierre y cash son exactamente las mismas y los dos números se pueden comparar.
 */

const FILAS = [
  { id: 'agendadas', label: 'Agendas', format: 'count' },
  { id: 'showRate', label: 'Show rate', format: 'pct' },
  { id: 'noShowRate', label: 'No show', format: 'pct', mejorSi: 'baja' },
  { id: 'closeRate', label: 'Close rate', format: 'pct' },
  { id: 'cashUsd', label: 'Cash cobrado', format: 'usd' },
  { id: 'facturacionUsd', label: 'Facturación', format: 'usd' },
  { id: 'aovUsd', label: 'AOV', format: 'usd' },
];

/** '2026-10' → '2026-09' */
function mesAnterior(ym) {
  const [a, m] = ym.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

const valor = (v, format) => (v === null || v === undefined ? '—' : formatValue(v, format));

export default function RendimientoCloser({ mes = {}, closer }) {
  const { mes: elegido } = useMes();
  const actual = elegido || mesId();
  const anterior = mesAnterior(actual);
  const { data, loading } = useResource(() => getMisLlamadas(closer, anterior), [closer, anterior]);
  const antes = data?.mes ?? {};

  return (
    <Card title={`Cómo venís contra ${formatMes(anterior)}`} className="rend-closer">
      {loading && !data ? (
        <div className="empty">Buscando el mes pasado…</div>
      ) : (
        <div className="comparar">
          <div className="comparar-cab">
            <span />
            <span>{formatMes(actual)}</span>
            <span />
            <span>{formatMes(anterior)}</span>
          </div>
          {FILAS.map((f) => {
            const hoy = mes[f.id];
            const ayer = antes[f.id];
            const dif = (hoy != null && ayer != null) ? hoy - ayer : null;
            // El juicio no es el signo: en No show, subir es peor.
            const mejor = dif === null || dif === 0
              ? null
              : (f.mejorSi === 'baja' ? dif < 0 : dif > 0);
            return (
              <div key={f.id} className="comparar-fila">
                <span className="comparar-label">{f.label}</span>
                <span className="comparar-valor num">{valor(hoy, f.format)}</span>
                <span className={`comparar-dif num${mejor === null ? '' : mejor ? ' mejor' : ' peor'}`}>
                  {dif === null || dif === 0 ? '' : `${dif > 0 ? '↑' : '↓'} ${formatValue(Math.abs(dif), f.format)}`}
                </span>
                <span className="comparar-antes num dim">{valor(ayer, f.format)}</span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
