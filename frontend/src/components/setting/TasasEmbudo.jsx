import { useState } from 'react';
import DetalleMetrica from '../ventas/DetalleMetrica.jsx';
import { LLAMADA_ESTADO, PITCH_ESTADO, conjuntosDeTasas, pct } from '../../lib/setting.js';

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
  { id: 'booking', label: 'Booking rate', unidad: 'pitches', num: 'agendas', den: 'pitchesResueltos', verde: 30, amarillo: 20,
    detalle: 'Los pitches del período que ya se resolvieron: agendaron, dijeron que no o ghostearon. Los que todavía no contestaron no entran, porque no fallaron nada.' },
  { id: 'show', label: 'Show rate', unidad: 'calls', num: 'shows', den: 'llamadasResueltas', verde: 80, amarillo: 65,
    detalle: 'Las llamadas que caían en el período y ya se sabe qué pasó con ellas. El corte es el día de la llamada, no el del pitch.' },
  { id: 'close', label: 'Close rate', unidad: 'shows', num: 'cierres', den: 'shows', verde: 25, amarillo: 15,
    detalle: 'Las llamadas a las que el prospecto vino. Sobre eso se mide cuántas cerraron.' },
  { id: 'setting', label: 'Setting rate', unidad: 'ciclos completos', num: 'cierresDelPitch', den: 'recorridosCompletos',
    detalle: 'Los pitches que llegaron al final: o no agendaron, o agendaron y la llamada ya se resolvió. Los que tienen la call por delante quedan afuera.' },
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
  { label: 'Pitches', campo: 'pitches', color: 'var(--s3)',
    detalle: 'Todos los links de agenda mandados en el período.' },
  { label: 'Agendas', campo: 'agendas', color: 'var(--s4)',
    detalle: 'Los pitches del período que terminaron con una llamada agendada.' },
  { label: 'Shows', campo: 'shows', color: 'var(--s1)',
    detalle: 'Las llamadas del período a las que el prospecto vino.' },
  { label: 'Closes', campo: 'cierres', color: 'var(--ok)',
    detalle: 'Las llamadas del período que cerraron. Las señas no entran: reservaron cupo, la venta no está hecha.' },
];

const R = 34;
const CIRC = 2 * Math.PI * R;

/** Un anillo con el x/y adentro y el porcentaje al lado. */
function Anillo({ label, unidad, valor, num, den, color, onVer }) {
  const avance = valor == null ? 0 : Math.min(valor, 100) / 100;
  return (
    <article className={`anillo-card${onVer ? ' clickable' : ''}`} style={{ '--tono': color }}
      onClick={onVer} role={onVer ? 'button' : undefined} tabIndex={onVer ? 0 : undefined}
      onKeyDown={onVer ? (e) => (e.key === 'Enter' || e.key === ' ') && onVer() : undefined}>
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
      {onVer ? <span className="anillo-ver">ver pitches</span> : null}
    </article>
  );
}

/**
 * @param {{ m: object }} props
 */
export default function TasasEmbudo({ m, pitches, lim, canal = '' }) {
  const [detalle, setDetalle] = useState(null);
  if (!m) return null;
  const tope = Math.max(m.pitches, 1);
  const pendientes = m.pitchesPendientes;
  const porOcurrir = m.porOcurrir;

  // Un número que no se puede abrir obliga a creerle al sistema. Los conjuntos salen del
  // mismo criterio que usa el servidor para contarlos, así que lo que se lista es
  // exactamente lo que entró en la cuenta.
  const C = pitches ? conjuntosDeTasas(pitches, lim ?? {}, canal) : null;
  const abrir = (titulo, explicacion, filas) => () => setDetalle({
    titulo, explicacion, encabezado: 'Cómo salió', unidad: ['pitch', 'pitches'],
    llamadas: [...filas]
      .sort((a, b) => (b.pitchAt || '').localeCompare(a.pitchAt || ''))
      .map((p) => ({
        id: p.id, eventoId: `pitch-${p.id}`, prospecto: p.prospecto || 'Sin nombre',
        fechaAt: p.pitchAt, estado: p.pitchEstado,
      })),
    columna: (l) => {
      const p = filas.find((x) => `pitch-${x.id}` === l.eventoId);
      if (!p) return '—';
      const call = LLAMADA_ESTADO[p.llamadaEstado]?.label ?? p.llamadaEstado;
      return call || PITCH_ESTADO[p.pitchEstado]?.label || p.pitchEstado || '—';
    },
  });

  return (
    <>
      <div className="anillos">
        {TASAS.map((t) => (
          <Anillo key={t.id} label={t.label} unidad={t.unidad} valor={m[t.id]}
            num={m[t.num]} den={m[t.den]} color={tono(m[t.id], t.verde, t.amarillo)}
            onVer={C ? abrir(t.label, t.detalle, C[t.id].sobre) : undefined} />
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
          <div key={e.campo} className={`barra-fila${C ? ' clickable' : ''}`}
            onClick={C ? abrir(e.label, e.detalle, C.etapas[e.campo]) : undefined}
            role={C ? 'button' : undefined} tabIndex={C ? 0 : undefined}
            onKeyDown={C ? (ev) => (ev.key === 'Enter' || ev.key === ' ')
              && abrir(e.label, e.detalle, C.etapas[e.campo])() : undefined}>
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

      {detalle ? <DetalleMetrica {...detalle} onCerrar={() => setDetalle(null)} /> : null}
    </>
  );
}
