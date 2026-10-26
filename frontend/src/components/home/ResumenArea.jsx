import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Modal from '../ui/Modal.jsx';
import Pill from '../ui/Pill.jsx';
import { formatValue } from '../../lib/format.js';

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
 *
 * Los montos van enteros. Antes se redondeaban a miles —US$ 25.900 se leía "$26k"— y el
 * valor exacto vivía en el globito del mouse, que en el celular no existe: el tablero
 * decía un número y la página de al lado decía otro.
 *
 * Y todo número se abre. El que trae sus filas las muestra acá mismo; el que no, lleva a
 * la página donde están. Un número que no se puede desarmar no se puede discutir.
 */

/** Una celda de la tabla del detalle, según cómo la pidió la columna. */
function celda(fila, col) {
  const v = fila[col.clave];
  if (col.render) return col.render(fila);
  if (v === null || v === undefined || v === '') return '—';
  return col.format ? formatValue(Number(v), col.format) : v;
}

/**
 * La tabla del detalle, en grupos.
 *
 * Una lista corrida de 31 cuotas no explica el número que se tocó: hay que leerla
 * entera para ver qué parte ya entró. Cada grupo lleva su propio subtotal, así la suma
 * de arriba se ve sin hacer cuentas.
 */
function TablaDetalle({ columnas, grupos }) {
  const vacia = grupos.every((g) => !g.filas.length);
  if (vacia) return <div className="empty">No hay nada para mostrar.</div>;
  return (
    <div className="table-wrap">
      <table className="data detalle-metrica">
        {/* Los anchos van declarados: con las filas de grupo, que son un colspan, el
            navegador repartía las columnas a ojo y la cabecera terminaba antes que las
            filas. */}
        <colgroup>
          {columnas.map((c) => <col key={c.clave} style={c.ancho ? { width: c.ancho } : undefined} />)}
        </colgroup>
        <thead>
          <tr>
            {columnas.map((c) => <th key={c.clave} className={c.align === 'right' ? 'right' : ''}>{c.label}</th>)}
          </tr>
        </thead>
        {grupos.filter((g) => g.filas.length).map((g) => (
          <tbody key={g.titulo ?? 'todo'}>
            {g.titulo && (
              <tr className="detalle-grupo">
                <th colSpan={columnas.length - 1} scope="rowgroup">
                  {g.titulo} <span className="dim">· {g.filas.length} {g.filas.length === 1 ? (g.unidad ?? 'cuota') : `${g.unidad ?? 'cuota'}s`}</span>
                </th>
                <th className="right num">{g.total}</th>
              </tr>
            )}
            {g.filas.map((f, i) => (
              <tr key={f.id ?? `${g.titulo}-${i}`}>
                {columnas.map((c) => (
                  <td key={c.clave} className={`${c.align === 'right' ? 'right num' : ''}${c.clave === columnas[0].clave ? ' strong' : ''}`}>
                    {celda(f, c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

/**
 * @param {{ titulo: string, dueno?: string, href: string, estado?: { tone: string, label: string },
 *           metricas: { label: string, valor: number | string, format?: string, meta?: number | null,
 *                       nota?: string, tono?: string, href?: string,
 *                       detalle?: { titulo: string, sub?: string, columnas: object[],
 *                                   grupos: { titulo?: string, filas: object[], total?: string }[] } }[],
 *           pie?: React.ReactNode }} props
 */
export default function ResumenArea({ titulo, dueno, href, estado, metricas = [], pie }) {
  const [abierta, setAbierta] = useState(null);
  const navegar = useNavigate();

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
          const valor = typeof m.valor === 'number' ? formatValue(m.valor, formato) : m.valor;
          const conMeta = Number(m.meta) > 0;
          const pct = conMeta ? Math.min(100, (Number(m.valor) / Number(m.meta)) * 100) : null;
          const abrible = Boolean(m.detalle?.grupos?.some((g) => g.filas.length)) || Boolean(m.href);
          return (
            <button
              key={m.label}
              type="button"
              className={`area-metrica${abrible ? ' abrible' : ''}`}
              disabled={!abrible}
              onClick={() => (m.detalle?.grupos?.some((g) => g.filas.length) ? setAbierta(m) : navegar(m.href))}
            >
              <span className="area-metrica-label">{m.label}</span>
              {/* Un monto largo en una columna de tres no entra a 24px: se achica en vez
                  de redondearse, que era lo que hacía que el número no fuera el real. */}
              <span className={`area-metrica-valor num${valor.length > 9 ? ' largo' : ''}${m.tono ? ` zona-${m.tono}` : ''}`}>
                {valor}
              </span>
              {conMeta && <span className="area-metrica-meta dim">de {formatValue(m.meta, formato)}</span>}
              {conMeta && (
                <span className="area-metrica-barra">
                  <span style={{ width: `${pct}%`, background: `var(--${m.tono === 'alert' ? 'alert' : m.tono === 'warn' ? 'warn' : 'ok'})` }} />
                </span>
              )}
              {m.nota && <span className="area-metrica-nota">{m.nota}</span>}
            </button>
          );
        })}
      </div>

      {pie && <footer className="area-resumen-pie">{pie}</footer>}

      <Modal
        open={Boolean(abierta)}
        onClose={() => setAbierta(null)}
        title={abierta?.detalle?.titulo ?? ''}
        className="detalle-metrica-modal"
        wide
      >
        {abierta?.detalle?.sub && <p className="dim" style={{ marginTop: 0 }}>{abierta.detalle.sub}</p>}
        {abierta && (
          <TablaDetalle columnas={abierta.detalle.columnas} grupos={abierta.detalle.grupos} />
        )}
      </Modal>
    </section>
  );
}
