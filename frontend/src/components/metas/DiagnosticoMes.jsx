import Pill from '../ui/Pill.jsx';
import Card from '../ui/Card.jsx';

const TONE = { alert: 'alert', warn: 'warn', ok: 'ok' };

/**
 * Alertas accionables del embudo (texto corto, ordenadas por severidad).
 * @param {{ alertas: import('../../lib/metasMes.js').AlertaDiagnostico[],
 *           sub?: string }} props
 */
export default function DiagnosticoMes({ alertas, sub }) {
  if (!alertas?.length) return null;

  return (
    <Card
      title="Diagnóstico del mes"
      sub={sub || 'Cuello de botella según tasas del decreto vs real'}
    >
      <ol className="diag-lista">
        {alertas.map((a, i) => (
          <li key={a.id} className={`diag-item diag-${a.severidad}`}>
            <span className="diag-n num">{i + 1}</span>
            <div className="diag-cuerpo">
              <div className="diag-titulo-row">
                <strong>{a.titulo}</strong>
                <Pill tone={TONE[a.severidad]} dot>
                  {a.severidad === 'alert' ? 'urgente' : a.severidad === 'warn' ? 'atención' : 'ok'}
                </Pill>
              </div>
              {a.etapa && <div className="diag-etapa">{a.etapa}</div>}
              <p>{a.mensaje}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
