import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';
import SourceTag from '../ui/SourceTag.jsx';
import { formatFecha, formatValue } from '../../lib/format.js';

const ZONA_PILL = { ok: 'ok', warn: 'warn', alert: 'alert' };
const ZONA_LABEL = { ok: 'en ritmo', warn: '−10%', alert: 'abajo' };

/**
 * @param {{ filas: import('../../lib/metasMes.js').FilaAvance[],
 *           titulo?: string,
 *           sub?: string,
 *           syncAt?: string,
 *           compacto?: boolean }} props
 */
export default function AvanceVsMeta({ filas, titulo = 'Avance vs meta', sub, syncAt, compacto = false }) {
  const visibles = compacto
    ? filas.filter((f) => !['agendas_organicas', 'cash_organico', 'cash_ads'].includes(f.id) || f.id === 'agendas_ads')
    : filas;

  return (
    <Card
      title={titulo}
      sub={sub}
      actions={<SourceTag sourceId="manual" updatedAt={syncAt} conNombre={false} />}
      foot={
        <span className="meta-avance-foot">
          <i className="dot manual" />
          Decreto del mes · lo carga el equipo
          {syncAt ? ` · ${formatFecha(syncAt)}` : ''}
        </span>
      }
    >
      <div className={`meta-avance-grid${compacto ? ' compacto' : ''}`}>
        {visibles.map((f) => {
          const pctBar = Math.min(120, Math.max(0, f.pctRitmo * 100));
          const deltaFmt =
            f.format === 'pct'
              ? `${f.delta >= 0 ? '+' : ''}${f.delta.toFixed(1)} pp`
              : `${f.delta >= 0 ? '+' : '−'}${formatValue(Math.abs(f.delta), f.format)}`;
          return (
            <div key={f.id} className={`meta-avance-fila zona-${f.zona}`}>
              <div className="meta-avance-top">
                <span className="meta-avance-label">{f.label}</span>
                <Pill tone={ZONA_PILL[f.zona]} dot>
                  {ZONA_LABEL[f.zona]}
                </Pill>
              </div>
              <div className="meta-avance-nums">
                <span className="num meta-avance-real">{formatValue(f.real, f.format)}</span>
                <span className="dim">
                  / meta {formatValue(f.meta, f.format)}
                  {f.tipo !== 'tasa' && (
                    <> · ritmo a hoy {formatValue(f.esperado, f.format)}</>
                  )}
                </span>
              </div>
              <div className={`meta-avance-track zona-${f.zona}`}>
                <span style={{ width: `${Math.min(100, pctBar)}%` }} />
              </div>
              <div className={`meta-avance-delta ${f.delta >= 0 ? 'up' : 'down'}`}>
                {deltaFmt} vs ritmo esperado
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
