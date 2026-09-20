import { pct } from '../../lib/setting.js';

/**
 * Las cuatro tasas en anillos y el embudo en barras, como en SetSystem.
 *
 * El anillo dice la proporción de un vistazo y el x/y del centro dice sobre cuántos:
 * un 100% sacado de tres casos y otro de treinta se ven igual si solo se muestra el
 * porcentaje, y no valen lo mismo.
 */

// El anillo se pinta con el juicio del número contra su rango sano, no con un color
// decorativo por tasa: si el color no dice nada, es ruido.
const TASAS = [
  { id: 'booking', label: 'Booking rate', unidad: 'pitches', num: 'agendas', den: 'pitchesResueltos', verde: 30, amarillo: 20 },
  { id: 'show', label: 'Show rate', unidad: 'calls', num: 'shows', den: 'llamadasResueltas', verde: 80, amarillo: 65 },
  { id: 'close', label: 'Close rate', unidad: 'shows', num: 'cierres', den: 'shows', verde: 25, amarillo: 15 },
  { id: 'setting', label: 'Setting rate', unidad: 'ciclos completos', num: 'cierresDelPitch', den: 'recorridosCompletos' },
];

const tono = (v, verde, amarillo) => {
  if (v == null || !verde) return 'var(--s4)';
  if (v >= verde) return 'var(--ok)';
  if (v >= amarillo) return 'var(--warn)';
  return 'var(--alert)';
};

// El embudo es una sola cosa que se va achicando: una escala de grafito lo cuenta mejor
// que cuatro colores, y deja el verde libre para cuando de verdad significa algo.
const ETAPAS = [
  { label: 'Pitches', campo: 'pitches', color: 'var(--s3)' },
  { label: 'Agendas', campo: 'agendas', color: 'var(--s4)' },
  { label: 'Shows', campo: 'shows', color: 'var(--s1)' },
  { label: 'Closes', campo: 'cierres', color: 'var(--ok)' },
];

const R = 34;
const CIRC = 2 * Math.PI * R;

/** Un anillo con el x/y adentro y el porcentaje al lado. */
function Anillo({ label, unidad, valor, num, den, color }) {
  const avance = valor == null ? 0 : Math.min(valor, 100) / 100;
  return (
    <article className="anillo-card" style={{ '--tono': color }}>
      <div className="anillo-fila">
        <svg className="anillo" viewBox="0 0 80 80" role="img" aria-label={`${label}: ${pct(valor)}`}>
          <circle cx="40" cy="40" r={R} className="anillo-pista" />
          <circle
            cx="40" cy="40" r={R} className="anillo-arco"
            strokeDasharray={`${CIRC * avance} ${CIRC}`}
            transform="rotate(-90 40 40)"
          />
          <text x="40" y="44" className="anillo-frac" textAnchor="middle">
            <tspan className="anillo-num">{num}</tspan>
            <tspan className="anillo-den">/{den}</tspan>
          </text>
        </svg>
        <span className="anillo-pct num">{pct(valor)}</span>
      </div>
      <span className="anillo-label">{label}</span>
      <span className="anillo-unidad dim">{unidad}</span>
    </article>
  );
}

/**
 * @param {{ m: object }} props
 */
export default function TasasEmbudo({ m }) {
  if (!m) return null;
  const tope = Math.max(m.pitches, 1);
  const pendientes = m.pitchesPendientes;
  const porOcurrir = m.porOcurrir;

  return (
    <>
      <div className="anillos">
        {TASAS.map((t) => (
          <Anillo key={t.id} label={t.label} unidad={t.unidad} valor={m[t.id]}
            num={m[t.num]} den={m[t.den]} color={tono(m[t.id], t.verde, t.amarillo)} />
        ))}
      </div>

      {(pendientes > 0 || porOcurrir > 0) && (
        <p className="dim nota-pendientes">
          De los <strong>{m.pitches}</strong> leads del período quedan fuera del cálculo
          {pendientes > 0 && ` ${pendientes} pitch${pendientes > 1 ? 'es' : ''} sin responder`}
          {pendientes > 0 && porOcurrir > 0 && ' y'}
          {porOcurrir > 0 && ` ${porOcurrir} call${porOcurrir > 1 ? 's' : ''} sin resolver`}
          : todavía no fallaron nada.
        </p>
      )}

      <div className="embudo-barras">
        <h4 className="bloque-titulo">Embudo</h4>
        {ETAPAS.map((e) => (
          <div key={e.campo} className="barra-fila">
            <span className="barra-label">{e.label}</span>
            <span className="barra-pista">
              <span className="barra-relleno" style={{ width: `${(m[e.campo] / tope) * 100}%`, background: e.color }} />
            </span>
            <span className="barra-valor num">{m[e.campo]}</span>
          </div>
        ))}
        {m.depositos > 0 && (
          <p className="dim nota-pendientes">
            + {m.depositos} {m.depositos === 1 ? 'depósito' : 'depósitos'} — reservaron cupo pero no cuentan como cierre.
          </p>
        )}
      </div>
    </>
  );
}
