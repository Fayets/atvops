import { Link } from 'react-router-dom';
import Pill from '../ui/Pill.jsx';
import { formatCompact, formatValue } from '../../lib/format.js';

/**
 * Un área en el cuadro de mando, con la misma forma que todas las demás.
 *
 * La gracia es que sean iguales: tres números por área, en el mismo lugar y con el mismo
 * tamaño. Cuando cada tarjeta muestra lo suyo a su manera —una con semáforo, otra con
 * gráfico, otra con una lista— el tablero obliga a releer la pantalla entera para saber
 * cómo viene el mes.
 *
 * La barra aparece solo cuando hay meta decretada. Sin meta, el número va solo: inventar
 * un objetivo para tener algo que dibujar es peor que no dibujar nada.
 */

/**
 * @param {{ titulo: string, dueno?: string, href: string, estado?: { tone: string, label: string },
 *           metricas: { label: string, valor: number | string, format?: string, meta?: number | null,
 *                       nota?: string, tono?: string }[],
 *           pie?: React.ReactNode }} props
 */
export default function ResumenArea({ titulo, dueno, href, estado, metricas = [], pie }) {
  return (
    <section className="area-resumen">
      <header>
        <Link to={href} className="area-resumen-titulo">
          <span className="strong">{titulo}</span>
          {dueno && <span className="dim">· {dueno}</span>}
        </Link>
        {estado && <Pill tone={estado.tone}>{estado.label}</Pill>}
      </header>

      <div className="area-resumen-metricas">
        {metricas.map((m) => {
          const formato = m.format ?? 'count';
          // Compacto a propósito: tres columnas con "US$ 151.400" al lado de otra igual se
          // pisan, y acá lo que importa es el orden de magnitud, no el peso exacto.
          const valor = typeof m.valor === 'number' ? formatCompact(m.valor, formato) : m.valor;
          const conMeta = Number(m.meta) > 0;
          const pct = conMeta ? Math.min(100, (Number(m.valor) / Number(m.meta)) * 100) : null;
          return (
            <div key={m.label} className="area-metrica" title={typeof m.valor === 'number' ? formatValue(m.valor, formato) : undefined}>
              <span className="area-metrica-label">{m.label}</span>
              <span className={`area-metrica-valor num${m.tono ? ` zona-${m.tono}` : ''}`}>{valor}</span>
              {conMeta && <span className="area-metrica-meta dim">de {formatCompact(m.meta, formato)}</span>}
              {conMeta && (
                <span className="area-metrica-barra">
                  <span style={{ width: `${pct}%`, background: `var(--${m.tono === 'alert' ? 'alert' : m.tono === 'warn' ? 'warn' : 'ok'})` }} />
                </span>
              )}
              {m.nota && <span className="area-metrica-nota">{m.nota}</span>}
            </div>
          );
        })}
      </div>

      {pie && <footer className="area-resumen-pie">{pie}</footer>}
    </section>
  );
}
