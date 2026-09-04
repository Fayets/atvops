import { useMemo, useState } from 'react';

/**
 * Tabla genérica. Las columnas describen cómo se ve cada campo; los datos ya
 * vienen tipados de `src/data/`, así que la tabla no sabe nada del dominio.
 *
 * @typedef {{ key: string, label: string, align?: 'left' | 'right',
 *             render?: (row: any) => React.ReactNode, value?: (row: any) => any,
 *             sortable?: boolean }} Columna
 * @param {{ columns: Columna[], rows: any[], rowKey?: (row: any) => string,
 *           initialSort?: { key: string, dir: 'asc' | 'desc' }, empty?: string,
 *           onRowClick?: (row: any) => void }} props
 */
export default function DataTable({
  columns,
  rows,
  rowKey = (r) => r.id,
  initialSort,
  empty = 'Sin datos.',
  onRowClick,
}) {
  const [sort, setSort] = useState(initialSort ?? null);

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
          {ordenadas.map((row) => (
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
    </div>
  );
}
