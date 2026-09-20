import { formatValue } from '../../lib/format.js';

/**
 * La cabecera de un área: los números grandes y, debajo, los gráficos que cuentan cómo
 * se llegó a ellos.
 *
 * Cada número viene con la línea que dice qué es. Es la mitad del asunto: un tablero que
 * obliga a preguntar qué mide cada cosa no lo mira nadie.
 *
 * Solo lo ven admin, operaciones y founder: es la lectura de dirección, no la pantalla
 * de trabajo de cada área.
 */

export const n = (v, f = 'count') => formatValue(v ?? 0, f);
export const pct = (v) => (v == null ? '—' : `${Math.round(v * 10) / 10}%`);

/** Un número con su definición debajo. El tono solo cuando el valor se juzga. */
export function Kpi({ label, valor, nota, tono }) {
  return (
    <article className="ops-kpi">
      <span className="ops-kpi-label">{label}</span>
      <span className={`ops-kpi-valor num${tono ? ` zona-${tono}` : ''}`}>{valor}</span>
      <span className="ops-kpi-nota">{nota}</span>
    </article>
  );
}

/**
 * @param {{ kpis: { label: string, valor: React.ReactNode, nota: string, tono?: string }[],
 *           children?: React.ReactNode, pie?: React.ReactNode }} props
 */
export default function PanelArea({ kpis = [], children, pie }) {
  return (
    <>
      {kpis.length > 0 && (
        <div className="ops-kpis">
          {kpis.map((k) => <Kpi key={k.label} {...k} />)}
        </div>
      )}
      {children && <div className="ops-graficos">{children}</div>}
      {pie && <div className="ops-tasas-pie">{pie}</div>}
    </>
  );
}
