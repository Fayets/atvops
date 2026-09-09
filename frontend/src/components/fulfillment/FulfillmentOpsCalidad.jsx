import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';
import { formatFecha, formatValue } from '../../lib/format.js';

const QUEJA_TONE = {
  abierta: 'alert',
  en_curso: 'warn',
  resuelta: 'ok',
};

/**
 * Bloque 4: calidad, wins y quejas.
 * @param {{ calidad: object }} props
 */
export default function FulfillmentOpsCalidad({ calidad: c }) {
  return (
    <div className="ff-ops-calidad">
      <Card title="Calidad y wins" sub="Señales agregadas del mes">
        <div className="ff-ops-calidad-nums">
          <div>
            <div className="k">Quejas del mes</div>
            <div className="n num">{c.quejasMes}</div>
            <div className="dim" style={{ fontSize: 12 }}>
              {c.deltaQuejas >= 0 ? '+' : ''}
              {c.deltaQuejas} vs mes ant.
            </div>
          </div>
          <div>
            <div className="k">Wins del mes</div>
            <div className="n num" style={{ color: 'var(--ok)' }}>
              {c.winsMes}
            </div>
            <div className="dim" style={{ fontSize: 12 }}>
              {c.deltaWins >= 0 ? '+' : ''}
              {c.deltaWins} vs mes ant.
            </div>
          </div>
          <div>
            <div className="k">Ratio wins / quejas</div>
            <div className="n num">{formatValue(c.ratioWinsQuejas, 'x')}</div>
          </div>
          <div>
            <div className="k">NPS</div>
            <div className="n num">{c.nps}</div>
          </div>
          <div>
            <div className="k">Onboarding prom.</div>
            <div className="n num">{formatValue(c.diasOnboardingPromedio, 'days')}</div>
          </div>
          <div>
            <div className="k">Activación 7 d</div>
            <div className="n num">{formatValue(c.tasaActivacion7d, 'pct')}</div>
          </div>
        </div>
      </Card>

      <div className="split even">
        <Card title="Últimas quejas" sub={`${c.quejas.length} recientes`} flush>
          {c.quejas.map((q) => (
            <div key={q.id} className="lista-item">
              <Pill tone={QUEJA_TONE[q.estado] ?? 'plain'} dot>
                {q.estado.replace('_', ' ')}
              </Pill>
              <span className="who">{q.cliente}</span>
              <span className="q">
                {q.motivo} · {q.responsable} · {formatFecha(q.fechaAt)}
              </span>
            </div>
          ))}
        </Card>

        <Card title="Últimos wins" sub={`${c.wins.length} recientes`} flush>
          {c.wins.map((w) => (
            <div key={w.id} className="lista-item">
              <Pill tone="ok" dot>
                win
              </Pill>
              <span className="who">{w.cliente}</span>
              <span className="q">
                {w.resultado} · {w.responsable} · {formatFecha(w.fechaAt)}
              </span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
