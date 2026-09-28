import { useEffect, useMemo, useState } from 'react';

/**
 * Tabla genérica. Las columnas describen cómo se ve cada campo; los datos ya
 * vienen tipados de `src/data/`, así que la tabla no sabe nada del dominio.
 *
 * @typedef {{ key: string, label: string, align?: 'left' | 'right',
 *             render?: (row: any) => React.ReactNode, value?: (row: any) => any,
 *             sortable?: boolean }} Columna
 * `porPagina` la parte en páginas. Es opcional a propósito: una tabla de diez filas no
 * necesita controles, y ponerlos donde no hacen falta agrega ruido. Cuando está, el pie
 * dice qué tramo se está viendo, porque "página 2 de 6" no contesta cuántas filas hay.
 *
 * @param {{ columns: Columna[], rows: any[], rowKey?: (row: any) => string,
 *           initialSort?: { key: string, dir: 'asc' | 'desc' }, empty?: string,
 *           porPagina?: number, onRowClick?: (row: any) => void }} props
 */
export default function DataTable({
  columns,
  rows,
  rowKey = (r) => r.id,
  initialSort,
  empty = 'Sin datos.',
  porPagina,
  onRowClick,
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [pagina, setPagina] = useState(0);

  const ordenadas = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const valor = col.value ?? ((r) => r[col.key]);
    return [...rows].sort((a, b) => {
      const va = valor(a);
      const vb = valor(b);
      if (va === vb) return 0;
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es');
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sort, columns]);

  const paginado = porPagina > 0 && ordenadas.length > porPagina;
  const paginas = paginado ? Math.ceil(ordenadas.length / porPagina) : 1;
  // Reordenar o filtrar puede dejar la página actual fuera de rango; volver a la
  // primera es mejor que mostrar una tabla vacía sin explicación.
  useEffect(() => { setPagina((p) => (p < paginas ? p : 0)); }, [paginas]);
  const desde = paginado ? pagina * porPagina : 0;
  const visibles = paginado ? ordenadas.slice(desde, desde + porPagina) : ordenadas;

  if (!rows.length) return <div className="empty">{empty}</div>;

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`${c.align === 'right' ? 'right' : ''}${c.sortable === false ? '' : ' sortable'}`}
                onClick={() => {
                  if (c.sortable === false) return;
                  setSort((s) =>
                    s && s.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'desc' },
                  );
                }}
              >
                {c.label}
                {sort?.key === c.key && <span className="caret">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibles.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? 'clickable' : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={c.align === 'right' ? 'right' : ''}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {paginado ? (
        <div className="tabla-paginas">
          <span className="dim">
            {desde + 1}–{Math.min(desde + porPagina, ordenadas.length)} de {ordenadas.length}
          </span>
          <div className="tabla-paginas-botones">
            <button
              type="button" className="btn sm ghost" disabled={pagina === 0}
              onClick={() => setPagina((p) => Math.max(0, p - 1))}
            >
              Anterior
            </button>
            <span className="dim">{pagina + 1} / {paginas}</span>
            <button
              type="button" className="btn sm ghost" disabled={pagina >= paginas - 1}
              onClick={() => setPagina((p) => Math.min(paginas - 1, p + 1))}
            >
              Siguiente
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
