import HBars from '../charts/HBars.jsx';
import Card from '../ui/Card.jsx';
import { formatValue } from '../../lib/format.js';

/**
 * Bloque 3: salud agregada de la cartera.
 * @param {{ salud: object }} props
 */
export default function FulfillmentOpsSalud({ salud: s }) {
  return (
    <Card
      title="Salud de la cartera"
      sub="Estados, programas y señales de renovación"
      foot={s.alerta || undefined}
    >
      <div className="ff-ops-salud-grid">
        <div>
          <div className="k" style={{ marginBottom: 10 }}>
            Por estado
          </div>
          <HBars
            format="count"
            participacion
            colores={s.porEstado.map((e) => e.color)}
            data={s.porEstado.map((e) => ({
              label: e.label,
              value: e.valor,
              sub: formatValue(e.pct, 'pct'),
            }))}
          />
        </div>

        <div>
          <div className="k" style={{ marginBottom: 10 }}>
            Por programa
          </div>
          <div className="ff-ops-prog-list">
            {s.programas.map((p) => (
              <div key={p.id} className="ff-ops-prog-row">
                <span className="who">{p.label}</span>
                <span className="num">{p.clientes}</span>
                <span className="dim num">{formatValue(p.revenueUsd, 'usd')}</span>
              </div>
            ))}
          </div>

          <div className="ff-ops-salud-flags">
            <div>
              <div className="k">En pausa</div>
              <div className="n num">{s.enPausa}</div>
            </div>
            <div>
              <div className="k">No renuevan</div>
              <div className="n num" style={{ color: 'var(--brand-hi)' }}>
                {s.noRenuevan}
              </div>
            </div>
            <div>
              <div className="k">Llamada recompra</div>
              <div className="n num">{s.enLlamadaRecompra}</div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
