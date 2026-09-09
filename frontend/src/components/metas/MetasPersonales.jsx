import MetaRow from '../home/MetaRow.jsx';
import Card from '../ui/Card.jsx';
import { ritmo } from '../../lib/pacing.js';

/**
 * Metas personales en números (mismo patrón MetaRow del cuadro de mando).
 * @param {{
 *   titulo?: string,
 *   sub?: string,
 *   items: Array<{ id: string, nombre: string, meta: number, actual: number, format?: string }>,
 *   diaHoy: number,
 *   diasMes: number,
 * }} props
 */
export default function MetasPersonales({
  titulo = 'Tu cuota del mes',
  sub = 'Alineada a la proyección / decreto',
  items,
  diaHoy,
  diasMes,
}) {
  return (
    <Card title={titulo} sub={sub} className="metas-personales">
      <div className="metas-personales-list">
        {items.map((it) => {
          const meta = {
            id: it.id,
            nombre: it.nombre,
            meta: it.meta,
            format: it.format || 'count',
            acumulado: [it.actual],
          };
          const r = ritmo({
            meta: it.meta,
            actual: it.actual,
            diasMes,
            diaHoy,
          });
          return <MetaRow key={it.id} meta={meta} ritmo={r} />;
        })}
      </div>
    </Card>
  );
}
