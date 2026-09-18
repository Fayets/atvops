import { pct, zona } from '../../lib/setting.js';

/**
 * Las cuatro tasas y el embudo, como los muestra SetSystem: cada tasa con su x/y, y
 * abajo Pitches → Agendas → Shows → Closes.
 *
 * Se usa en Sets y en Métricas: son los mismos números mirados en distinto período.
 */
export default function TasasEmbudo({ m }) {
  if (!m) return null;
  const tasas = [
    { id: 'booking', label: 'Booking rate', valor: m.booking, x: m.agendas, y: m.pitches, v: 30, a: 20 },
    { id: 'show', label: 'Show rate', valor: m.show, x: m.shows, y: m.ocurridas, v: 80, a: 65 },
    { id: 'close', label: 'Close rate', valor: m.close, x: m.cierres, y: m.shows, v: 25, a: 15 },
    { id: 'setting', label: 'Setting rate', valor: m.setting, x: m.cierres, y: m.pitches },
  ];
  const paso = (a, b) => (b > 0 ? `${Math.round((a / b) * 1000) / 10}%` : '—');
  return (
    <>
      <div className="tasas">
        {tasas.map((t) => (
          <div key={t.id} className="tasa">
            <span className="tasa-label">{t.label}</span>
            <span className={`tasa-valor num${t.v ? zona(t.valor, t.v, t.a) : ''}`}>{pct(t.valor)}</span>
            <span className="tasa-pie dim num">{t.x} / {t.y}</span>
          </div>
        ))}
      </div>
      {m.porOcurrir > 0 && (
        <p className="dim sets-nota">
          Quedan fuera del cálculo {m.porOcurrir} {m.porOcurrir === 1 ? 'call' : 'calls'} por ocurrir.
        </p>
      )}
      <div className="embudo sets-embudo">
        {[
          ['Pitches', m.pitches], ['Agendas', m.agendas], ['Shows', m.shows], ['Closes', m.cierres],
        ].map(([label, valor], i, arr) => (
          <div key={label} className="sets-etapa-wrap">
            {i > 0 && (
              <div className="embudo-paso"><span className="embudo-pct num dim">{paso(valor, arr[i - 1][1])}</span></div>
            )}
            <article className="etapa">
              <span className="etapa-label">{label}</span>
              <span className="etapa-valor num">{valor}</span>
            </article>
          </div>
        ))}
      </div>
      {m.depositos > 0 && (
        <p className="dim sets-nota">
          + {m.depositos} {m.depositos === 1 ? 'depósito' : 'depósitos'} — reservaron cupo pero no cuentan como cierre.
        </p>
      )}
    </>
  );
}
